// Firebase Configuration for PESO Booking System
const firebaseConfig = {
  apiKey: "AIzaSyCHhgYpRHYfLclABfx9OeThBYcMkigjkPI",
  authDomain: "peso-academy-db.firebaseapp.com",
  projectId: "peso-academy-db",
  storageBucket: "peso-academy-db.firebasestorage.app",
  messagingSenderId: "665907883781",
  appId: "1:665907883781:web:9f6cd72267be1160d5d16c",
  measurementId: "G-2ECXE9PM7G"
};

// Initialize Firebase safely
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize Firestore
const db = firebase.firestore();
