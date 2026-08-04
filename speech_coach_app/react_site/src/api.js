const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

export { API_BASE };

async function _parseJSON(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text }; }
  }
  if (!response.ok) throw new Error(data.detail || data.error || `Server error ${response.status}`);
  return data;
}

export async function checkPronunciation(target, audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  const response = await fetch(`${API_BASE}/check/${encodeURIComponent(target)}?accent=indian`, {
    method: 'POST',
    body: formData
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.detail || `Server error ${response.status}`);
  }

  return data;
}

export async function translateAudio(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'hindi_recording.wav');

  const response = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    body: formData
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `Server error ${response.status}`);
  }

  return data;
}

export async function fetchGrammarSentence(level) {
  const response = await fetch(`${API_BASE}/grammar/${encodeURIComponent(level)}`);
  
  if (!response.ok) {
    throw new Error(`Server error ${response.status}`);
  }

  return await response.json();
}

export async function checkGrammar(level, sentenceId, audioBlob) {
  const formData = new FormData();
  formData.append('level', level);
  formData.append('sentence_id', sentenceId);
  formData.append('audio', audioBlob, 'grammar_recording.wav');

  const response = await fetch(`${API_BASE}/grammar/check`, {
    method: 'POST',
    body: formData
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { feedback: [text] };
    }
  }

  if (!response.ok) {
    throw new Error(`Server error ${response.status}`);
  }

  return data;
}

export async function fetchScenario(topic = 'daily') {
  const response = await fetch(`${API_BASE}/translation/scenario?topic=${encodeURIComponent(topic)}`);
  return _parseJSON(response);
}

export async function translateInterview(audioBlob, question, accent = 'indian') {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'interview_recording.wav');
  formData.append('question', question);
  formData.append('accent', accent);

  const response = await fetch(`${API_BASE}/translate/interview`, {
    method: 'POST',
    body: formData
  });
  return _parseJSON(response);
}
