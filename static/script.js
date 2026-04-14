/* ========= 初始化與變數 ========= */
mermaid.initialize({ startOnLoad: false });

let username = sessionStorage.getItem('chat_username');
if (!username) {
  username = '使用者' + Math.floor(Math.random() * 1000);
  sessionStorage.setItem('chat_username', username);
}

// ⚠️ 建立連線 (這行非常重要，絕對不能少)
const socket = io(); 

/* ===== 初次加入 ===== */
socket.emit("join", { username });

/* ===== UI 狀態更新 ===== */
function updateStatus(ok, msg = "已連線") {
  const el = $("#connection-status");
  if (ok) {
    el.text(msg).css("background-color", "#d4edda");
    setTimeout(() => el.fadeOut(), 3000);
  } else {
    el.stop().show().text(msg).css("background-color", "#f8d7da");
  }
}

function scrollBottom() {
  const m = document.getElementById("chat-messages");
  if (m) m.scrollTop = m.scrollHeight;
}

function addSystem(text) {
  $("#chat-messages").append(`<div class="connection-status">${text}</div>`);
  scrollBottom();
}

/* ===== Markdown / Mermaid / Highlight ===== */
function format(txt) {
  txt = txt.trim();
  let html = marked.parse(txt);
  html = DOMPurify.sanitize(html);

  html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (m, c) => {
    const raw = c.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    return `<div class="mermaid-container"><button class="copy-btn" onclick="copyText(this,'${encodeURIComponent(raw)}')">複製</button><pre class="mermaid">${raw}</pre></div>`;
  });

  html = html.replace(/<pre><code class="language-([\w]+)">([\s\S]*?)<\/code><\/pre>/g, (m, l, c) => {
    if (l === "mermaid") return m;
    return `<div class="code-block"><button class="copy-btn" onclick="copyText(this,'${encodeURIComponent(c)}')">複製</button><pre><code class="language-${l} hljs">${c}</code></pre></div>`;
  });

  return html;
}

function renderCode() {
  requestAnimationFrame(() => {
    document.querySelectorAll("pre code").forEach((b) => hljs.highlightElement(b));
    mermaid.init(undefined, ".mermaid");
  });
}

function copyText(btn, encoded) {
  const text = decodeURIComponent(encoded);
  navigator.clipboard.writeText(text).then(() => {
    btn.innerText = "已複製！";
    setTimeout(() => (btn.innerText = "複製"), 1500);
  }).catch(() => alert("複製失敗"));
}

function addMessage(content, isMe, sender) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const html = `
    <div class="message ${isMe ? "user-message" : "other-message"} clearfix">
      ${!isMe ? `<div class="user-info"><span class="user-name">${sender}</span></div>` : ""}
      <div class="message-content">${format(content)}</div>
      <div class="message-time">${time}</div>
    </div>`;
  $("#chat-messages").append(html);
  renderCode();
  scrollBottom();
}

/* ===== 發送與接收訊息核心 ===== */
function send() {
  const txt = $('#message-input').val().trim();
  if (!txt) return;

  // 1. 顯示在自己的畫面
  addMessage(txt, true, username);

  // 2. 傳送給後端
  socket.emit("send_message", { content: txt });

  // 3. 清空輸入框
  $('#message-input').val('').height('auto');
  scrollBottom();
}

/* ===== 按鈕與輸入框事件 ===== */
$("#send-button").on("click", send);
$("#message-input").on("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

$("#clear-btn").on("click", () => {
  if (confirm("確定要清空聊天？")) $("#chat-messages").empty();
});

/* ===== 表情選單 ===== */
$(".emoji-btn").on("click", function (e) {
  e.stopPropagation();
  const emojis = ["😊", "😂", "😍", "👍", "❤️", "😉", "🎉", "👋"];
  if ($(".emoji-menu").length) {
    $(".emoji-menu").remove();
    return;
  }
  let menu = $('<div class="emoji-menu p-2 bg-white rounded shadow" style="position:absolute;z-index:100; bottom:50px;"></div>');
  emojis.forEach((em) => {
    const item = $(`<span class="emoji-item p-1" style="cursor:pointer;font-size:1.5rem;">${em}</span>`);
    item.on("click", () => {
      $("#message-input").val($("#message-input").val() + em);
      menu.remove();
    });
    menu.append(item);
  });
  $(this).after(menu);
});

$(document).on("click", () => $(".emoji-menu").remove());

/* ===== Socket 監聽事件 ===== */
socket.on("connect", () => updateStatus(true));
socket.on("disconnect", () => updateStatus(false, "連線中斷"));
socket.on("connect_error", () => updateStatus(false, "連線錯誤"));
socket.on("user_count", (d) => $("#online-count").text(d.count));
socket.on("user_joined", (d) => addSystem(`${d.username} 加入了聊天`));
socket.on("user_left", (d) => addSystem(`${d.username} 離開了聊天`));

socket.on("chat_message", (d) => {
  addMessage(d.content, false, d.username);
});

/* ===== Typing 功能區 ===== */
function showTyping(user) {
  if (user === username) return;
  
  const cls = "typing-" + user.replace(/\s+/g, "-");
  
  if ($("." + cls).length) {
    clearTimeout($("." + cls).data("timer"));
  } else {
    $("#chat-messages").append(
      `<div class="${cls} typing-indicator connection-status" style="background-color:#e2e3e5; color:#383d41;">${user} 正在輸入...</div>`
    );
  }
  
  const timer = setTimeout(() => {
    $("." + cls).fadeOut("fast", function() {
      $(this).remove();
    });
  }, 1500);
  
  $("." + cls).data("timer", timer);
  scrollBottom();
}

socket.on("typing", (d) => showTyping(d.username));

let typingTimer;
$("#message-input").on("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
  
  if (!typingTimer) {
    socket.emit("typing", { username });
    typingTimer = setTimeout(() => {
      typingTimer = null;
    }, 1000); 
  }
});

/* ===== 改暱稱 ===== */
$("#change-name-btn").on("click", () => {              // 當使用者按下「改名稱」按鈕時觸發
  const v = prompt("輸入新名稱：", username);          
  // 跳出輸入框，預設顯示目前使用者名稱
  if (v && v.trim() && v !== username) {               // 檢查：新名稱不能是空的或與舊名稱相同
    socket.emit("change_username", {                  // 將舊名稱與新名稱發送給伺服器
      oldUsername: username,
      newUsername: v,
    });
    username = v.trim();                               // 更新本地端的使用者名稱變數
    sessionStorage.setItem("chat_username", username); // 將新名稱儲存到 sessionStorage（頁面重整後仍保留）
  }
});

// 監聽伺服器廣播事件，當有人更改名稱時執行
socket.on("user_changed_name", (d) =>
  addSystem(`${d.oldUsername} 更名為 ${d.newUsername}`) // 在系統訊息區顯示「某人更名為XXX」
);
