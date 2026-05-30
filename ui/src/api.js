const json = (r) => r.json();

export const listDocuments = () => fetch("/api/documents").then(json);

export const uploadDocuments = (files) => {
  const fd = new FormData();
  [...files].forEach((f) => fd.append("files", f));
  return fetch("/api/upload", { method: "POST", body: fd }).then(json);
};

export const deleteDocument = (id) =>
  fetch(`/api/documents/${id}`, { method: "DELETE" }).then(json);

export const askQuestion = (question, documentIds, sessionId) =>
  fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, documentIds, sessionId }),
  }).then(json);
