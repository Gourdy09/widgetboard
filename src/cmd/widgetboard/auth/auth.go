package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

const (
	sessionCookie = "wb_session"
	sessionTTL    = 12 * time.Hour
)

// Auth is a deliberately small placeholder: one username/password, in-memory sessions.
// It keeps the admin panel behind a login for now; real security (mTLS, hashed credentials,
// rate limiting) comes later, as described in the README.
type Auth struct {
	userHash [32]byte
	passHash [32]byte
	user     string

	mu       sync.Mutex
	sessions map[string]time.Time
}

func New(user, pass string) *Auth {
	return &Auth{
		user:     user,
		userHash: sha256.Sum256([]byte(user)),
		passHash: sha256.Sum256([]byte(pass)),
		sessions: map[string]time.Time{},
	}
}

func (a *Auth) check(user, pass string) bool {
	u := sha256.Sum256([]byte(user))
	p := sha256.Sum256([]byte(pass))
	// Hash first so the comparison is constant-time regardless of input length.
	okUser := subtle.ConstantTimeCompare(u[:], a.userHash[:])
	okPass := subtle.ConstantTimeCompare(p[:], a.passHash[:])
	return okUser&okPass == 1
}

func (a *Auth) newSession() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	token := hex.EncodeToString(b)
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	for t, exp := range a.sessions { // drop expired sessions as we go
		if now.After(exp) {
			delete(a.sessions, t)
		}
	}
	a.sessions[token] = now.Add(sessionTTL)
	return token
}

func (a *Auth) Valid(r *http.Request) bool {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	exp, ok := a.sessions[c.Value]
	if !ok || time.Now().After(exp) {
		delete(a.sessions, c.Value)
		return false
	}
	return true
}

// require wraps a handler so it only runs for a signed-in admin.
func (a *Auth) Require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.Valid(r) {
			http.Error(w, "sign in required", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (a *Auth) LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if !a.check(body.Username, body.Password) {
		time.Sleep(600 * time.Millisecond) // slow down guessing
		http.Error(w, "wrong username or password", http.StatusUnauthorized)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    a.newSession(),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   r.TLS != nil,
		MaxAge:   int(sessionTTL.Seconds()),
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		a.mu.Lock()
		delete(a.sessions, c.Value)
		a.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/", MaxAge: -1, HttpOnly: true})
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) SessionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if a.Valid(r) {
		json.NewEncoder(w).Encode(map[string]any{"authenticated": true, "user": a.user})
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"authenticated": false})
}
