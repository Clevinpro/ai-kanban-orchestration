import { useCallback, useSyncExternalStore } from 'react';

const ACTIVE_CONVERSATION_STORAGE_KEY = 'activeConversationId';

type ActiveConversationSnapshot = string | null;
type Listener = () => void;

const listeners = new Set<Listener>();
let activeConversationId: ActiveConversationSnapshot = readStoredActiveConversationId();

function readStoredActiveConversationId(): ActiveConversationSnapshot {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
}

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function setActiveConversationId(nextConversationId: ActiveConversationSnapshot) {
  activeConversationId = nextConversationId;

  if (typeof window !== 'undefined') {
    if (nextConversationId) {
      window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, nextConversationId);
    } else {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }
  }

  notifyListeners();
}

function subscribe(listener: Listener) {
  listeners.add(listener);

  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }

  const storedConversationId = readStoredActiveConversationId();
  if (activeConversationId !== storedConversationId) {
    activeConversationId = storedConversationId;
    notifyListeners();
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== ACTIVE_CONVERSATION_STORAGE_KEY) {
      return;
    }

    activeConversationId = event.newValue;
    notifyListeners();
  };

  window.addEventListener('storage', handleStorageChange);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorageChange);
  };
}

function getSnapshot() {
  return activeConversationId;
}

function getServerSnapshot() {
  return null;
}

export function useActiveConversation() {
  const activeId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const clearActiveConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  return {
    activeId,
    selectConversation,
    clearActiveConversation,
  };
}
