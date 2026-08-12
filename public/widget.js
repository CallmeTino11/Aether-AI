/**
 * Aether AI — Embeddable Chat Widget
 *
 * Drop-in script for a customer's website:
 *
 *   <script src="https://cdn.aether-ai.example/widget.js"
 *           data-employee-id="..."
 *           data-api-base="https://app.aether-ai.example"
 *           defer></script>
 *
 * Constraints this file is written under:
 *  - No dependencies and no build step: it is embedded on other people's sites,
 *    where a framework runtime would be an unreasonable payload and a version
 *    conflict risk.
 *  - Shadow DOM, so the host page's CSS cannot break the widget and the
 *    widget's CSS cannot break the host page.
 *  - All message text is inserted via textContent, never innerHTML. Replies
 *    originate from a language model reading business-supplied knowledge; that
 *    is untrusted input for rendering purposes, and an escalation path is no
 *    excuse for an XSS hole.
 *  - The session token lives in sessionStorage keyed to the employee, so a page
 *    refresh continues the conversation but a new tab starts clean.
 */

(function initAetherWidget() {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var employeeId = script.getAttribute("data-employee-id");
  var apiBase = (script.getAttribute("data-api-base") || "").replace(/\/+$/, "");
  if (!employeeId || !apiBase) {
    console.error("[aether] widget requires data-employee-id and data-api-base");
    return;
  }

  var STORAGE_KEY = "aether.session." + employeeId;

  var state = {
    conversationId: null,
    sessionToken: null,
    sending: false,
    open: false,
  };

  try {
    var saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      state.conversationId = parsed.conversationId || null;
      state.sessionToken = parsed.sessionToken || null;
    }
  } catch (error) {
    // Private browsing modes can throw on sessionStorage access. A widget that
    // cannot remember the session still works; one that crashes does not.
  }

  function persistSession() {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          conversationId: state.conversationId,
          sessionToken: state.sessionToken,
        }),
      );
    } catch (error) {
      /* non-fatal */
    }
  }

  // --- Shadow DOM shell -----------------------------------------------------

  var host = document.createElement("div");
  host.setAttribute("data-aether-widget", "");
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = [
    ":host { all: initial; }",
    "* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    ".launcher { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;",
    "  border-radius: 50%; border: none; cursor: pointer; background: #1f2937; color: #fff;",
    "  font-size: 22px; box-shadow: 0 4px 14px rgba(0,0,0,.25); z-index: 2147483000; }",
    ".launcher:focus-visible { outline: 3px solid #60a5fa; outline-offset: 2px; }",
    ".panel { position: fixed; bottom: 88px; right: 20px; width: 352px; max-width: calc(100vw - 40px);",
    "  height: 460px; max-height: calc(100vh - 120px); display: none; flex-direction: column;",
    "  background: #fff; border-radius: 12px; overflow: hidden; z-index: 2147483000;",
    "  box-shadow: 0 12px 32px rgba(0,0,0,.22); }",
    ".panel[data-open='true'] { display: flex; }",
    ".header { padding: 12px 14px; background: #1f2937; color: #fff; font-weight: 600; font-size: 14px; }",
    ".log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;",
    "  background: #f9fafb; }",
    ".msg { max-width: 82%; padding: 8px 11px; border-radius: 12px; font-size: 14px; line-height: 1.45;",
    "  white-space: pre-wrap; word-wrap: break-word; }",
    ".msg.them { align-self: flex-start; background: #fff; border: 1px solid #e5e7eb; color: #111827; }",
    ".msg.me { align-self: flex-end; background: #2563eb; color: #fff; }",
    ".msg.note { align-self: center; background: #fef3c7; color: #92400e; font-size: 12.5px; }",
    ".typing { align-self: flex-start; font-size: 12.5px; color: #6b7280; padding: 4px 2px; }",
    ".composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e5e7eb; background: #fff; }",
    ".composer input { flex: 1; padding: 9px 11px; border: 1px solid #d1d5db; border-radius: 8px;",
    "  font-size: 14px; min-width: 0; }",
    ".composer input:focus-visible { outline: 2px solid #2563eb; outline-offset: -1px; }",
    ".composer button { padding: 9px 14px; border: none; border-radius: 8px; background: #2563eb;",
    "  color: #fff; font-size: 14px; cursor: pointer; }",
    ".composer button[disabled] { background: #9ca3af; cursor: not-allowed; }",
  ].join("\n");
  root.appendChild(style);

  var launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.textContent = "\u{1F4AC}";
  root.appendChild(launcher);

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat");
  root.appendChild(panel);

  var header = document.createElement("div");
  header.className = "header";
  header.textContent = "Chat";
  panel.appendChild(header);

  var log = document.createElement("div");
  log.className = "log";
  // Announces new replies to screen readers without stealing focus.
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  panel.appendChild(log);

  var composer = document.createElement("div");
  composer.className = "composer";
  panel.appendChild(composer);

  var input = document.createElement("input");
  input.type = "text";
  input.setAttribute("aria-label", "Message");
  input.placeholder = "Type a message\u2026";
  input.maxLength = 2000; // Mirrors the server-side limit.
  composer.appendChild(input);

  var sendButton = document.createElement("button");
  sendButton.textContent = "Send";
  composer.appendChild(sendButton);

  // --- Rendering ------------------------------------------------------------

  function addMessage(text, kind) {
    var element = document.createElement("div");
    element.className = "msg " + kind;
    // textContent, never innerHTML — see header note.
    element.textContent = text;
    log.appendChild(element);
    log.scrollTop = log.scrollHeight;
    return element;
  }

  var typingIndicator = null;
  function showTyping(show) {
    if (show && !typingIndicator) {
      typingIndicator = document.createElement("div");
      typingIndicator.className = "typing";
      typingIndicator.textContent = "typing\u2026";
      log.appendChild(typingIndicator);
      log.scrollTop = log.scrollHeight;
    } else if (!show && typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
  }

  function setSending(sending) {
    state.sending = sending;
    sendButton.disabled = sending;
    input.disabled = sending;
    showTyping(sending);
  }

  // --- Networking -----------------------------------------------------------

  function request(path, options) {
    return fetch(apiBase + path, options).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          if (!response.ok) {
            var error = new Error(body.message || "Request failed");
            error.status = response.status;
            error.code = body.error;
            throw error;
          }
          return body;
        });
    });
  }

  function ensureConversation() {
    if (state.conversationId && state.sessionToken) {
      return Promise.resolve(null);
    }
    return request("/widget/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId: employeeId }),
    }).then(function (data) {
      state.conversationId = data.conversationId;
      state.sessionToken = data.sessionToken;
      persistSession();
      header.textContent = data.employeeName || "Chat";
      addMessage(data.greeting, "them");
      return data;
    });
  }

  function send() {
    var text = input.value.trim();
    if (!text || state.sending) return;

    input.value = "";
    addMessage(text, "me");
    setSending(true);

    ensureConversation()
      .then(function () {
        return request(
          "/widget/conversations/" + encodeURIComponent(state.conversationId) + "/messages",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-session-token": state.sessionToken,
            },
            body: JSON.stringify({ text: text }),
          },
        );
      })
      .then(function (data) {
        setSending(false);
        addMessage(data.reply, "them");
        if (data.escalated) {
          // Only claim notification when the server confirms an alert was
          // actually queued. Saying "a team member has been notified" when
          // nothing was queued is a promise to a real person that the system
          // does not keep.
          addMessage(
            data.teamNotified
              ? "A team member has been notified and will follow up."
              : "I've flagged this for the team to pick up.",
            "note",
          );
        }
      })
      .catch(function (error) {
        setSending(false);
        // A stale session (cleared server-side, or a redeployed environment)
        // should recover on the next attempt rather than dead-ending.
        if (error.status === 401) {
          state.conversationId = null;
          state.sessionToken = null;
          persistSession();
          addMessage("Your session expired. Please send that again.", "note");
          return;
        }
        if (error.status === 429) {
          addMessage(error.message || "Too many messages. Please wait a moment.", "note");
          return;
        }
        addMessage("Sorry, something went wrong. Please try again.", "note");
      });
  }

  // --- Events ---------------------------------------------------------------

  launcher.addEventListener("click", function () {
    state.open = !state.open;
    panel.setAttribute("data-open", String(state.open));
    launcher.setAttribute("aria-label", state.open ? "Close chat" : "Open chat");
    if (state.open) {
      input.focus();
      if (log.childElementCount === 0) {
        ensureConversation().catch(function () {
          addMessage("Chat is unavailable right now.", "note");
        });
      }
    }
  });

  sendButton.addEventListener("click", send);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") send();
  });
  panel.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.open) {
      launcher.click();
      launcher.focus();
    }
  });
})();
