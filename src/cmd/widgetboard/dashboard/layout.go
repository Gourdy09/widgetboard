package dashboard

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"widgetboard/cmd/widgetboard/auth"
	"widgetboard/static"
)

// Store keeps the dashboard layout on disk (the embedded default is read-only).
// If no saved layout exists yet, the embedded json/dashboard.json is served instead.
type Store struct {
	path string
}

func NewStore(dataDir string) *Store {
	return &Store{path: filepath.Join(dataDir, "dashboard.json")}
}

func (s *Store) read() ([]byte, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return fs.ReadFile(static.Files, "json/dashboard.json")
	}
	return data, err
}

// write saves atomically: a crash or power loss mid-write can never leave a half-written layout.
func (s *Store) write(data []byte) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), "dashboard-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.path)
}

// Handler serves GET and PUT /api/layout (PUT requires a signed-in admin, see main.go).
// The server only checks that the document is well-formed JSON with a "cards" array.
// Sizes, overlaps, themes and card types are repaired by the layout engine in the browser
// every time the layout loads, so a bad file can never break the wall display.
func (s *Store) Handler(a *auth.Auth) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			s.get(w, r)
		case http.MethodPut:
			if !a.Valid(r) {
				http.Error(w, "sign in required", http.StatusUnauthorized)
				return
			}
			s.put(w, r)
		default:
			w.Header().Set("Allow", "GET, PUT")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Store) get(w http.ResponseWriter, r *http.Request) {
	data, err := s.read()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	sum := sha256.Sum256(data)
	etag := `"` + hex.EncodeToString(sum[:8]) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "no-cache") // always revalidate; the wall polls this
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (s *Store) put(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		http.Error(w, "body too large or unreadable", http.StatusRequestEntityTooLarge)
		return
	}
	var doc struct {
		Cards []json.RawMessage `json:"cards"`
	}
	if err := json.Unmarshal(body, &doc); err != nil || doc.Cards == nil {
		http.Error(w, `layout must be JSON with a "cards" array`, http.StatusBadRequest)
		return
	}
	if err := s.write(body); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
