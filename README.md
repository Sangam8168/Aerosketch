# Air Notepad ✨✍️  

**Air Notepad** is an experimental project that uses **computer vision** and **machine learning** to let users draw or write on a virtual notepad using **hand gestures** captured through a camera.  

This project is less about app development and more about exploring **gesture recognition**, **real-time ML inference**, and **human-computer interaction** using AI.  

---

## 🧠 Core Idea  

- Track hand landmarks using **MediaPipe Hand Landmarker model** (via Hugging Face)  
- Process the detected keypoints with **OpenCV** and **NumPy**  
- Convert movements into strokes on a virtual whiteboard  
- Explore handwriting-to-text possibilities as a next step  

👉 The main focus: understanding how raw landmark data can be transformed into structured signals for drawing and interaction.  

---

## 🛠️ Tech Stack  

- **Model & Tracking:** MediaPipe Hand Landmarker  
- **Processing & Visualization:** Python, OpenCV, NumPy  
- **Prototyping:** Jupyter Notebook (for experimentation and visualization)  
- **(Optional UI):** Flutter/Dart – used for demo, not the core focus  

---

## ⚡ Challenges & Learnings  

- Figuring out how to preprocess hand landmark data effectively  
- Handling noise and instability in real-time tracking  
- Iterating through multiple approaches for smoother stroke rendering  
- Understanding the gap between ML model outputs and usable application logic  

💡 Every iteration improved stability and accuracy, giving me hands-on insight into **bridging ML models with real-world applications**.  

---


## 🔮 Future Scope  

- Train a lightweight handwriting recognition model on top of stroke data  
- Extend to a **desktop application** with enhanced accuracy  
- Add more intuitive gestures (e.g., undo, erase, change color)  
- Research into **multi-modal AI** combining gesture + voice commands  

---



