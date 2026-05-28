import * as conversationApi from '@libs/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from './query-keys';

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations.all,
    queryFn: conversationApi.listConversations,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.conversations.one(id!),
    queryFn: () => conversationApi.getConversation(id!),
    enabled: !!id,
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationApi.deleteConversation(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      void queryClient.removeQueries({ queryKey: queryKeys.conversations.one(id) });
    },
  });
}
