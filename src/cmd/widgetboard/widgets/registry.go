package widgets

import (
	"encoding/json"
	"io"
	"net/http"
	"time"
)

const registryURL = "https://raw.githubusercontent.com/Gourdy09/widgetboard-widgets/main/registry.json"

// RegistryHandler proxies the community registry (admin only; see main.go).
func RegistryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	client := &http.Client{
		Timeout: 8 * time.Second,
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, registryURL, nil)
	if err != nil {
		http.Error(w, "could not create registry request", http.StatusInternalServerError)
		return
	}

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "community registry unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, "community registry unavailable", http.StatusBadGateway)
		return
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		http.Error(w, "could not read registry", http.StatusBadGateway)
		return
	}

	if !json.Valid(body) {
		http.Error(w, "invalid registry JSON", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Write(body)
}
