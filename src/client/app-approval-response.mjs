/** Keep failed card responses visible in their own conversation and retryable. */
export function createAppApprovalResponder({ request, notify }) {
  return async response => {
    const conversationId = response?.conversationId;
    try {
      return await request('appApprovals/respond', response);
    } catch (error) {
      try {
        // Never guess a recipient or disclose the response payload/error details.
        if (typeof conversationId === 'string' && conversationId.length > 0) {
          const message = error?.message;
          await notify(conversationId, typeof message === 'string' && message
            ? message : 'The app approval response could not be confirmed.');
        }
      } catch {
        // A disposed input or failed notice must not mask the request failure.
      }
      // The REA card handles this rejection by unlocking its explicit retry.
      throw error;
    }
  };
}
