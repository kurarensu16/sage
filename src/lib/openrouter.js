import { supabase } from './supabase';

const BOUNDARY_STATEMENT = 'This guidance is advisory and does not alter your official institutional grade.';

const sanitizeMessage = (value, maxLength = 1200) => String(value || '').trim().slice(0, maxLength);

async function invokeAdvisor(body) {
  const { data, error } = await supabase.functions.invoke('invoke-advisor', { body });

  if (error) {
    throw new Error(error.message || 'Ask ASPIRE is temporarily unavailable.');
  }

  const response = data?.response;
  if (!response || typeof response.message !== 'string' || !response.message.trim()) {
    throw new Error('Ask ASPIRE returned an invalid response.');
  }

  if (response.boundary_statement !== BOUNDARY_STATEMENT) {
    throw new Error('Ask ASPIRE returned an unverified advisory response.');
  }

  return {
    // Matches the invoke-advisor reply cap so list-style answers are not cut off.
    message: sanitizeMessage(response.message, 1600),
    actions: Array.isArray(response.actions)
      ? response.actions.map(action => sanitizeMessage(action, 240)).filter(Boolean).slice(0, 3)
      : [],
    consultationRecommended: Boolean(response.consultation_recommended),
    boundaryStatement: response.boundary_statement
  };
}

/**
 * Generates a short explanation for a posted official milestone. The Edge
 * Function owns provider credentials and validates the structured response.
 */
export async function getAiAcademicInsight(promptPayload) {
  let injectedPayload = { ...promptPayload };

  try {
    const result = await invokeAdvisor({
      mode: 'insight',
      context: injectedPayload
    });
    return result.message;
  } catch (error) {
    // Return nothing so no placeholder is saved as the student's insight; with no
    // saved insight, the AI Study Tutor tries again automatically on the next visit.
    console.warn('Ask ASPIRE insight generation failed; nothing saved, will retry on next visit.', error);
    return null;
  }
}

/**
 * Handles states where calling a generative provider would add no value or
 * could imply a risk conclusion unsupported by student-visible evidence.
 */
export function getBoundedAdvisorResponse(question, context) {
  // Return null to allow the generative AI to intelligently answer questions 
  // based on the live snapshot context, instead of falling back to canned phrases.
  return null;
}

// Chat fallback: answer from the same student-visible evidence shown in the panel,
// so the student still gets real records while the AI models are busy.
function getDeterministicFallback(context) {
  const evidence = (Array.isArray(context?.evidence) ? context.evidence : [])
    .filter(item => item?.label && item?.value)
    .slice(0, 4);
  const intro = 'Ask ASPIRE\'s AI is busy right now, so here is a summary of your records:';
  const outro = 'Please try your question again in a minute for a full explanation.';
  return evidence.length > 0
    ? `${intro}\n\n${evidence.map((item, index) => `${index + 1}. ${item.label}: ${item.value}`).join('\n')}\n\n${outro}`
    : `Ask ASPIRE's AI is busy right now. ${outro}`;
}

export async function getAskAspireResponse({ question, context, history = [] }) {
  const boundedResponse = getBoundedAdvisorResponse(question, context);
  if (boundedResponse) return boundedResponse;

  let injectedContext = { ...context };

  try {
    const result = await invokeAdvisor({
      mode: 'chat',
      question: sanitizeMessage(question, 600),
      context: injectedContext,
      history: history.slice(-6).map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: sanitizeMessage(message.content)
      }))
    });
    return result.message;
  } catch (error) {
    console.warn('Ask ASPIRE server response failed; using deterministic fallback.', error);
    return getDeterministicFallback(context);
  }
}
