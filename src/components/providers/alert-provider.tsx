"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

export function AlertDialogComponent({
  title,
  text,
  action,
  onCancel,
  canCancel,
}: {
  title: string;
  text: string;
  action: undefined | (() => void);
  onCancel: () => void;
  canCancel: boolean;
}) {
  const handleActionClick = () => {
    if (typeof action !== "undefined") {
      action();
    }
    onCancel();
  };

  return (
    <AlertDialog open={title !== "" || text !== ""}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {canCancel && (
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          )}
          {typeof action !== "undefined" && (
            <AlertDialogAction onClick={handleActionClick}>
              ต่อไป
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const AlertContext = createContext(
  (
    title: string,
    text: string,
    action: undefined | (() => void),
    canCancel: boolean,
  ) => {
    return [title, text, action, canCancel];
  },
);

export function AlertDialogProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [action, setAction] = useState<undefined | (() => void)>(undefined);
  const [canCancel, setCanCancel] = useState<boolean>(false);

  const onChangeAlert = useCallback(
    (
      title: string,
      text: string,
      action: undefined | (() => void),
      canCancel: boolean,
    ) => {
      setTitle(title);
      setText(text);
      setAction(() => action);
      setCanCancel(canCancel);
      return [title, text, action, canCancel];
    },
    [],
  );

  const onCancel = () => {
    setTitle("");
    setText("");
    setAction(undefined);
  };

  return (
    <AlertContext.Provider value={onChangeAlert}>
      {(title != "" || text != "") && (
        <AlertDialogComponent
          title={title}
          text={text}
          action={action}
          onCancel={onCancel}
          canCancel={canCancel}
        />
      )}
      {children}
    </AlertContext.Provider>
  );
}

export const useAlertContext = () => useContext(AlertContext);
