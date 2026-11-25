# modules

The host side of the widget package contract.

- `manifest.schema.json` is a copy of the manifest schema from
  [widgetboard-widgets](https://github.com/Gourdy09/widgetboard-widgets/blob/main/schema/manifest.schema.json).
  The installer will validate every package against it. The marketplace repository owns it; do not edit this copy,
  replace it when the contract changes.
- `types.js` holds the JSDoc types for the manifest, `ctx` and the widget module.

The specification is `docs/WIDGET_SPEC.md` in the marketplace repository.
