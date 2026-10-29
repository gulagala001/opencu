import { annotationMessageRule } from './annotation-message.mjs';

/** Use the host's common text presentation for sent, queued and steering messages. */
export function installAnnotationMessages(userText) {
  return userText.register(annotationMessageRule);
}
