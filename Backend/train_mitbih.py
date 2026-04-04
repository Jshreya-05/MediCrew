import numpy as np
import pandas as pd
import ast
from collections import Counter

from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from imblearn.over_sampling import SMOTE

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import (
    Conv1D, MaxPooling1D, BatchNormalization,
    Dropout, Flatten, Dense
)
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
import joblib

print("🚀 Training 1D-CNN model...")

CLASS_NAMES = [
    "Normal Sinus Rhythm",
    "Atrial Fibrillation",
    "Ventricular Fibrillation"
]

# ───────────────────────────────────────────────────────────────
# FIX SIGNAL LENGTH → 187
# ───────────────────────────────────────────────────────────────
def fix_length(signal, target_len=187):
    if len(signal) > target_len:
        return signal[:target_len]
    else:
        return np.pad(signal, (0, target_len - len(signal)))


# ───────────────────────────────────────────────────────────────
# LOAD + PREPROCESS
# ───────────────────────────────────────────────────────────────
def load_data(path: str):
    print("📂 Loading dataset...")

    df = pd.read_csv(path)

    X = df["signal"].apply(ast.literal_eval)
    X = np.array(X.tolist(), dtype=np.float32)
    X = np.array([fix_length(s) for s in X], dtype=np.float32)

    print(f"✅ Signal shape after fix: {X.shape}")

    label_map = {
        "Normal": 0,
        "AFib":   1,
        "VFib":   2
    }

    y = df["label"].map(label_map).values
    print(f"📊 Original distribution: {Counter(y)}")

    return X, y


# ───────────────────────────────────────────────────────────────
# BUILD 1D-CNN MODEL
# ───────────────────────────────────────────────────────────────
def build_cnn(input_len=187, num_classes=3):
    model = Sequential([

        # Block 1 — detect low-level wave features (P-wave, QRS onset)
        Conv1D(filters=32, kernel_size=5, activation="relu", padding="same",
               input_shape=(input_len, 1)),
        BatchNormalization(),
        MaxPooling1D(pool_size=2),
        Dropout(0.2),

        # Block 2 — detect mid-level patterns (QRS complex, T-wave)
        Conv1D(filters=64, kernel_size=5, activation="relu", padding="same"),
        BatchNormalization(),
        MaxPooling1D(pool_size=2),
        Dropout(0.2),

        # Block 3 — detect high-level rhythm patterns
        Conv1D(filters=128, kernel_size=3, activation="relu", padding="same"),
        BatchNormalization(),
        MaxPooling1D(pool_size=2),
        Dropout(0.3),

        # Classifier head
        Flatten(),
        Dense(128, activation="relu"),
        Dropout(0.4),
        Dense(64, activation="relu"),
        Dense(num_classes, activation="softmax")
    ])

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"]
    )

    return model


# ───────────────────────────────────────────────────────────────
# TRAIN
# ───────────────────────────────────────────────────────────────
def train():
    X, y = load_data("data/ecg_dataset_test.csv")

    # Split first
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"\nBefore SMOTE: {Counter(y_train)}")

    # SMOTE only on training data
    smote = SMOTE(random_state=42)
    X_train_sm, y_train_sm = smote.fit_resample(X_train, y_train)

    print(f"After SMOTE:  {Counter(y_train_sm)}")
    print(f"Test dist:    {Counter(y_test)}")

    # Reshape for CNN → (samples, timesteps, channels)
    X_train_cnn = X_train_sm.reshape(-1, 187, 1)
    X_test_cnn  = X_test.reshape(-1, 187, 1)

    # One-hot encode labels
    y_train_cat = to_categorical(y_train_sm, num_classes=3)
    y_test_cat  = to_categorical(y_test,     num_classes=3)

    # Build model
    model = build_cnn(input_len=187, num_classes=3)
    model.summary()

    # Callbacks
    callbacks = [
        EarlyStopping(
            monitor="val_accuracy",
            patience=10,
            restore_best_weights=True,
            verbose=1
        ),
        ModelCheckpoint(
            filepath="models/model_mitbih_cnn.keras",
            monitor="val_accuracy",
            save_best_only=True,
            verbose=1
        )
    ]

    print("\n⚡ Training CNN...")
    history = model.fit(
        X_train_cnn, y_train_cat,
        validation_split=0.15,
        epochs=50,
        batch_size=64,
        callbacks=callbacks,
        verbose=1
    )

    # ── EVALUATION ──
    y_pred_prob = model.predict(X_test_cnn)
    y_pred      = np.argmax(y_pred_prob, axis=1)
    acc         = accuracy_score(y_test, y_pred)

    print("\n==============================")
    print("📊 MODEL PERFORMANCE")
    print("==============================")
    print(f"✅ Accuracy: {acc:.4f} ({acc*100:.2f}%)\n")

    print("📄 Classification Report:")
    print(classification_report(y_test, y_pred, target_names=CLASS_NAMES))

    print("📉 Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Save final model
    model.save("models/model_mitbih_cnn.keras")
    print("\n💾 Model saved → models/model_mitbih_cnn.keras")


# ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    train()