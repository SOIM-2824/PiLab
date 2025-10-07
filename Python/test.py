import cv2
import os

cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml'
eye_cascade_path = cv2.data.haarcascades + 'haarcascade_eye_tree_eyeglasses.xml'

cap = cv2.VideoCapture(0)
cascade = cv2.CascadeClassifier(cascade_path)
eye_cascade = cv2.CascadeClassifier(eye_cascade_path)

print("こんにちは")
while True:
    ret, rgb = cap.read()
    if not ret or rgb is None:
        print("カメラから画像を取得できません")
        break

    gray = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.11, minNeighbors=3, minSize=(100, 100))

    if len(faces) == 1:
        x, y, w, h = faces[0, :]
        cv2.rectangle(gray, (x, y), (x + w, y + h), 255, 2)

        eyes_gray = gray[y : y + int(h/2), x : x + w]
        eyes = eye_cascade.detectMultiScale(eyes_gray, scaleFactor=1.11, minNeighbors=3, minSize=(8, 8))

        for ex, ey, ew, eh in eyes:
            cv2.rectangle(gray, (x + ex, y + ey), (x + ex + ew, y + ey + eh), 200, 1)

        if len(eyes) == 0:
            cv2.putText(gray,"sleep", (10,100), cv2.FONT_HERSHEY_PLAIN, 3, 255, 2, cv2.LINE_AA)

    cv2.imshow('frame', gray)
    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
