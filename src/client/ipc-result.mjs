/** Restore errors in the page after Electron IPC and contextBridge have copied the reply. */
export function unwrapOpenCU(reply) {
  if (reply?.opencuReply !== 1) throw new Error('OpenCU IPC reply requires the matching desktop adapter');
  if (!reply.ok) throw Object.assign(new Error(reply.error.message), reply.error);
  return reply.value;
}
