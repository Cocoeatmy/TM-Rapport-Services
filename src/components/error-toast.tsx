import { toast } from "sonner";

/**
 * Show an error toast with an optional "Réessayer" button.
 *
 * @param message  The error message to display.
 * @param onRetry  Callback invoked when the user clicks "Réessayer".
 */
export function showRetryToast(message: string, onRetry: () => void): void {
  toast.error(message, {
    duration: 8000,
    action: {
      label: "Réessayer",
      onClick: onRetry,
    },
  });
}
