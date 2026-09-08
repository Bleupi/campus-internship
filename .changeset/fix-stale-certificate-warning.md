---
"web": patch
---

Fix issue #72: the certificate-confirmation warning added in #45 could get stuck on screen in the read-only profile view (under "Modifier", with no checkbox or "Enregistrer" button to clear it). This happened after re-editing a profile that started in forced edit mode (an `INCOMPLETE`/`EXPIRED` profile with no explicit "Modifier" click), uploading a new certificate, then having the upload's response flip the profile out of forced-edit mode before the checkbox was re-ticked and the rest of the form saved.

- The warning now only ever renders while `editing` is `true`.
- Certificate-confirmation state (`certificateConsentChecked`/`certificateReplacedThisSession`) is reset by a single effect on every transition out of edit mode, not just the previously-handled explicit save and cancel paths.
