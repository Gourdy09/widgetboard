package main

import (
	"flag"
	"fmt"
	"html/template"
	"net/http"
	"os"

	"widgetboard/cmd/widgetboard/auth"
	"widgetboard/cmd/widgetboard/dashboard"
	"widgetboard/cmd/widgetboard/widgets"
	"widgetboard/static"
	"widgetboard/web"
)

type PageData struct {
	Message string
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	dataDir := flag.String("data", envOr("WIDGETBOARD_DATA", "data"), "directory where the saved layout lives")
	addr := flag.String("addr", envOr("WIDGETBOARD_ADDR", ":8080"), "address to listen on")
	adminUser := flag.String("admin-user", envOr("WIDGETBOARD_ADMIN_USER", "admin"), "admin username")
	adminPass := flag.String("admin-pass", envOr("WIDGETBOARD_ADMIN_PASS", "admin"), "admin password")
	flag.Parse()

	if *adminUser == "admin" && *adminPass == "admin" {
		fmt.Println("WARNING: using the default admin login (admin / admin). Set WIDGETBOARD_ADMIN_USER and WIDGETBOARD_ADMIN_PASS.")
	}

	// Parse both admin.html and dashboard.html from web/
	t, err := template.ParseFS(web.Templates, "*.html")
	if err != nil {
		panic(err)
	}
	render := func(name string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if err := t.ExecuteTemplate(w, name, PageData{}); err != nil {
				fmt.Println(err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
		}
	}

	a := auth.New(*adminUser, *adminPass)
	layout := dashboard.NewStore(*dataDir)

	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(static.Files))))
	http.HandleFunc("/", render("dashboard.html"))
	http.HandleFunc("/admin", render("admin.html"))

	http.HandleFunc("/api/login", a.LoginHandler)
	http.HandleFunc("/api/logout", a.LogoutHandler)
	http.HandleFunc("/api/session", a.SessionHandler)

	http.HandleFunc("/api/modules/registry", a.Require(widgets.RegistryHandler))
	http.HandleFunc("/api/layout", layout.Handler(a))

	fmt.Printf("Listening on %s (layout stored in %s)\n", *addr, *dataDir)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
