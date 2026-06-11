function sanitizeJsonString(str) {
  let insideString = false;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i-1] !== '\\')) {
      insideString = !insideString;
      result += char;
    } else if (char === '\n' && insideString) {
      result += '\\n';
    } else if (char === '\r' && insideString) {
      result += '\\r';
    } else {
      result += char;
    }
  }
  return result;
}

function autoCloseJson(str) {
  let insideString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      insideString = !insideString;
      continue;
    }
    if (!insideString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  let closed = str;
  if (insideString) {
    closed += '"';
  }
  while (stack.length) {
    closed += stack.pop();
  }
  return closed;
}

function parseAiContent(content) {
  if (!content) return null;
  
  let jsonCandidate = content.trim();
  
  const fenced = jsonCandidate.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) {
    jsonCandidate = fenced[1].trim();
  } else {
    const start = jsonCandidate.indexOf('{');
    const end = jsonCandidate.lastIndexOf('}');
    if (start !== -1) {
      if (end > start) {
        jsonCandidate = jsonCandidate.slice(start, end + 1);
      } else {
        jsonCandidate = jsonCandidate.slice(start);
      }
    }
  }

  const sanitized = sanitizeJsonString(jsonCandidate);
  const closed = autoCloseJson(sanitized);

  try {
    const cleanJson = closed.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleanJson);
  } catch (err) {
    try {
      return JSON.parse(content.trim());
    } catch {
      return null;
    }
  }
}

// Test cases
const testCases = [
  '{"type": "answer", "answer": "Hello"}',
  '```json\n{"type": "answer", "answer": "Hello fenced"}\n```',
  '```\n{"type": "answer", "answer": "Hello fenced bare"}\n```',
  'Here is the JSON:\n{"type": "answer", "answer": "Hello preamble"}',
  '{"type": "answer", "answer": "Hello suffix"}\nHope this helps!',
  'Sure!\n{"type": "answer", "answer": "Hello both"}\nLet me know if you need anything else.',
  '{"type": "answer", "answer": "Hello',
  '{"type": "answer", "howItWorks": ["step 1',
  '{"type": "answer", "answer": "Hello\nWorld", "list": [1, 2, 3, ]}'
];

for (const [i, tc] of testCases.entries()) {
  console.log(`\n--- Test Case ${i + 1} ---`);
  console.log('Raw:', JSON.stringify(tc));
  const res = parseAiContent(tc);
  console.log('Parsed:', res);
}
