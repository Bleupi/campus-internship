// The "still current" half of every FileObject freshness check, shared by
// StudentsService.currentFiles(), AdminStudentsQueueService.list() and
// AdminStudentsService.getCertificateStream() (issue #43 pulled this out —
// the third copy of the same OR clause). BR-06: an insurance certificate
// stops counting once its school-year expiresAt passes; a file with no
// expiresAt (e.g. ID_PHOTO) never does. Returns a fresh object on every
// call so `new Date()` is evaluated at query time, not once at import time.
export function currentFileFilter() {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}
