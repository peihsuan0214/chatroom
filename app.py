from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
# 初始化 SocketIO，允許跨域連線，並指定使用 eventlet 非同步模式
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

clients = {}  # 紀錄線上使用者 { sid: {"username": str} }

@app.route("/")
def index():
    return render_template("index.html")

# ===== 📡 SocketIO 事件處理區 =====

def broadcast_user_count():
    count = len([c for c in clients.values() if c.get("username")])
    emit("user_count", {"count": count}, broadcast=True)

@socketio.on("connect")
def on_connect():
    clients[request.sid] = {"username": None}
    print("Client connect:", request.sid)

@socketio.on("disconnect")
def on_disconnect():
    info = clients.pop(request.sid, None)
    if info and info.get("username"):
        emit("user_left", {"username": info["username"]}, broadcast=True)
        broadcast_user_count()
    print("Client disconnect:", request.sid)

@socketio.on("join")
def on_join(data):
    username = data.get("username", "匿名")
    clients[request.sid]["username"] = username
    emit("user_joined", {"username": username}, broadcast=True)
    broadcast_user_count()
    print(f"{username} joined")

@socketio.on("send_message")
def on_message(data):
    sender_info = clients.get(request.sid)
    username = sender_info["username"] if sender_info and sender_info.get("username") else "匿名"
    
    data["username"] = username
    emit("chat_message", data, broadcast=True, include_self=False)

# ⌨️ 新增：處理使用者正在輸入的狀態
@socketio.on("typing")
def on_typing(data):
    # 廣播「某人正在輸入」的狀態給其他人（不含自己）
    emit("typing", data, broadcast=True, include_self=False)


#  使用者更改名稱時觸發
@socketio.on("change_username")
def on_change(data):
    old = data.get("oldUsername")  # 原本的名稱
    new = data.get("newUsername")  # 新名稱

    # 如果這個 SID 還在 clients 裡，更新名稱
    if request.sid in clients:
        clients[request.sid]["username"] = new

    # 廣播名稱變更事件給所有人
    emit("user_changed_name",
         {"oldUsername": old, "newUsername": new},
         broadcast=True)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
