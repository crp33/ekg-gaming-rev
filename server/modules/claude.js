// ---------------------------------------------------------------------------
// Anthropic Claude API module
// ---------------------------------------------------------------------------
// Purpose: calls out to the Claude API for text generation / analysis.
//
// Setup when implementing:
//   npm install @anthropic-ai/sdk
//
// Requires ANTHROPIC_API_KEY to be set in .env (see .env.example).
//
// Example shape once implemented:
//
//   const Anthropic = require('@anthropic-ai/sdk');
//   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
//
//   async function ask(prompt) {
//     const message = await client.messages.create({
//       model: 'claude-sonnet-5',
//       max_tokens: 1024,
//       messages: [{ role: 'user', content: prompt }],
//     });
//     return message.content;
//   }
//
//   module.exports = { ask };

async function ask(_prompt) {
  throw new Error('claude module not yet implemented');
}

module.exports = { ask };
