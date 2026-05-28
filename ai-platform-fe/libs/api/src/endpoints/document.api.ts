import { apiClient } from '../client';
import type { IDocument, IUploadResponse, DocumentNote } from '../types/document.types';

export async function uploadDocument(file: File, title: string): Promise<IUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  const { data } = await apiClient.post<IUploadResponse>('/documents/upload', formData);
  return data;
}

export async function getDocuments(): Promise<IDocument[]> {
  const { data } = await apiClient.get<IDocument[]>('/documents');
  return data;
}

export async function getDocumentNotes(): Promise<DocumentNote[]> {
  const { data } = await apiClient.get<DocumentNote[]>('/documents/notes');
  return data;
}
