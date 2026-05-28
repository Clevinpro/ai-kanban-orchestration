export interface IDocument {
  id: string;
  title: string;
  createdAt: string;
}

export interface IUploadResponse {
  documentId: string;
  chunksCount: number;
}

export interface DocumentNote {
  id: string;
  title: string;
  createdAt: string;
  aiNotes: string | null;
  filePath: string | null;
}
