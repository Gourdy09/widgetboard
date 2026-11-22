// Command newcard scaffolds a new widget type and registers it.
//
//	cd src
//	go run ./cmd/newcard weather                 # type "weather", label "Weather"
//	go run ./cmd/newcard rss-feed "News Feed"    # type "rss-feed", label "News Feed"
//
// It creates static/js/cards/<name>Card.js and static/css/cards/<type>.css and adds the card to
// static/js/cards/index.js. The new widget then shows up in the admin palette straight away.
package main

import (
	"bytes"
	"embed"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"text/template"
)

//go:embed templates/*.tmpl
var templates embed.FS

var typeRe = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)

type card struct {
	Type  string // "rss-feed"
	Label string // "News Feed"
	Var   string // "rssFeedCard"
}

func main() {
	root := flag.String("root", "static", "path to the static directory")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: go run ./cmd/newcard [flags] <type-name> [\"Label\"]\n\n")
		fmt.Fprintf(os.Stderr, "  type-name  lowercase letters, digits and dashes, e.g. weather or rss-feed\n")
		fmt.Fprintf(os.Stderr, "  Label      name shown in the admin palette (default: derived from type-name)\n\n")
		flag.PrintDefaults()
	}
	flag.Parse()

	if flag.NArg() < 1 || flag.NArg() > 2 {
		flag.Usage()
		os.Exit(2)
	}
	name := flag.Arg(0)
	if !typeRe.MatchString(name) {
		fatalf("invalid type name %q: use lowercase letters, digits and single dashes, starting with a letter", name)
	}

	c := card{Type: name, Var: camel(name) + "Card", Label: title(name)}
	if flag.NArg() == 2 {
		c.Label = strings.TrimSpace(flag.Arg(1))
	}
	if c.Type == "default" {
		fatalf(`"default" is reserved`)
	}

	jsPath := filepath.Join(*root, "js", "cards", c.Var+".js")
	cssPath := filepath.Join(*root, "css", "cards", c.Type+".css")
	indexPath := filepath.Join(*root, "js", "cards", "index.js")

	index, err := os.ReadFile(indexPath)
	if err != nil {
		fatalf("cannot read %s: %v\n(run this from the src/ folder, or pass -root)", indexPath, err)
	}
	for _, p := range []string{jsPath, cssPath} {
		if _, err := os.Stat(p); err == nil {
			fatalf("%s already exists, not overwriting", p)
		}
	}
	if bytes.Contains(index, []byte(fmt.Sprintf(`type: "%s"`, c.Type))) || bytes.Contains(index, []byte(c.Var+".js")) {
		fatalf("%q looks like it is already registered in %s", c.Type, indexPath)
	}

	updated, err := register(string(index), c)
	if err != nil {
		fatalf("%v", err)
	}

	write(jsPath, render("card.js.tmpl", c))
	write(cssPath, render("card.css.tmpl", c))
	if err := os.WriteFile(indexPath, []byte(updated), 0o644); err != nil {
		fatalf("%v", err)
	}

	fmt.Printf("Created %s\nCreated %s\nRegistered in %s\n\n", jsPath, cssPath, indexPath)
	fmt.Printf("Next: open %s and fill in meta + render().\nThe widget is already in the admin palette (restart the Go server to pick up the new files).\n", jsPath)
}

// register adds the import and list entry above the marker comments in cards/index.js.
func register(index string, c card) (string, error) {
	const importMark = "// @cards:imports"
	const listMark = "// @cards:list"
	if !strings.Contains(index, importMark) || !strings.Contains(index, listMark) {
		return "", fmt.Errorf("index.js is missing the %q / %q markers", importMark, listMark)
	}
	index = strings.Replace(index, importMark, fmt.Sprintf("import * as %s from \"./%s.js\";\n%s", c.Var, c.Var, importMark), 1)
	index = strings.Replace(index, "  "+listMark, fmt.Sprintf("  %s,\n  %s", c.Var, listMark), 1)
	return index, nil
}

func render(name string, c card) string {
	t, err := template.ParseFS(templates, "templates/"+name)
	if err != nil {
		fatalf("%v", err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, c); err != nil {
		fatalf("%v", err)
	}
	return buf.String()
}

func write(path, content string) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fatalf("%v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		fatalf("%v", err)
	}
}

func camel(s string) string {
	parts := strings.Split(s, "-")
	for i := 1; i < len(parts); i++ {
		parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
	}
	return strings.Join(parts, "")
}

func title(s string) string {
	parts := strings.Split(s, "-")
	for i, p := range parts {
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	return strings.Join(parts, " ")
}

func fatalf(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "newcard: "+format+"\n", a...)
	os.Exit(1)
}
