package main

import (
	"fmt"
	"html/template"
	"net/http"
	"io"

	"widgetboard/static"
	"widgetboard/web"
)

type DashboardData struct {
	Message string
}

type AdminData struct {
	Message string
}

func NewDashboardData(message string) *DashboardData {
	return &DashboardData{
		Message: message,
	}
}

func NewAdminData(message string) *AdminData {
	return &AdminData{
		Message: message,
	}
}

func main() {
	dd := NewDashboardData("poopy")
	ad := NewAdminData("admin")

	// Parse both admin.html and dashboard.html from web/
	t, err := template.ParseFS(web.Templates, "*.html")
	if err != nil {
		panic(err)
	}

	// Serve dashboard.css at /static/dashboard.css
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(static.Files))))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		err = t.ExecuteTemplate(w, "dashboard.html", dd)
		if err != nil {
			fmt.Println(err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	})

	http.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		err = t.ExecuteTemplate(w, "admin.html", ad)
		if err != nil {
			fmt.Println(err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	})

	http.HandleFunc("/api/stock", func(w http.ResponseWriter, r *http.Request) {
		symbol := r.URL.Query().Get("symbol")
		if symbol == "" {
			symbol = "AAPL"
		}
		rangeVal := r.URL.Query().Get("range")
		if rangeVal == "" {
			rangeVal = "7d"
		}
		interval := r.URL.Query().Get("interval")
		if interval == "" {
			interval = "1h"
		}

		yahooURL := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=%s", symbol, rangeVal, interval)
		req, err := http.NewRequest("GET", yahooURL, nil)
		if err != nil {
		    http.Error(w, err.Error(), http.StatusInternalServerError)
		    return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			fmt.Println("Yahoo fetch error:", err)
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})

	fmt.Println("Listening on :8080...")
	http.ListenAndServe(":8080", nil)
}
