/**
 * Loads the Context7 AI chat widget on every docs page.
 * Mintlify auto-includes any .js file in the content directory.
 *
 * Admin: https://context7.com/angriff36/manifest/admin (Chat tab)
 * Docs: https://context7.com/docs/howto/chat-widget
 */
(function loadContext7ChatWidget() {
  if (document.querySelector('script[src="https://context7.com/widget.js"]')) {
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://context7.com/widget.js';
  script.async = true;
  script.setAttribute('data-library', '/angriff36/manifest');
  script.setAttribute('data-color', '#848c8e');
  script.setAttribute('data-position', 'bottom-right');
  script.setAttribute('data-placeholder', 'Ask about Manifest...');
  script.setAttribute(
    'data-welcome-message',
    'Ask me about Manifest — language, CLI, projections, and runtime.',
  );
  document.head.appendChild(script);
})();
