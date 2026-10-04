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
    message: sanitizeMessage(response.message),
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
    console.warn('Ask ASPIRE insight generation failed; using deterministic fallback.', error);
    return getDeterministicFallback(promptPayload, 'insight');
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

function getDeterministicFallback(context, mode = 'chat') {
  if (mode === 'chat') {
    return 'I am currently unable to process complex requests. Please check your official grades directly or try again later.';
  }

  const advisor = context?.deterministicAdvisor;
  if (!advisor) {
    return 'Ask ASPIRE is temporarily unavailable. The available course records do not provide enough information to confirm that.';
  }

  const firstAction = advisor.actions?.[0]?.description;
  return [advisor.summary, firstAction].filter(Boolean).join(' ') || advisor.headline;
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
    return getDeterministicFallback(context, 'chat');
  }
}
