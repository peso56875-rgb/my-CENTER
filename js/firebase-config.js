// Firebase Configuration for PESO Booking System
const firebaseConfig = {
  apiKey: "AIzaSyAP2r_0epXYiGoXwJk8ThuqJdlnzR_aiNo",
  authDomain: "my-center-c834a.firebaseapp.com",
  projectId: "my-center-c834a",
  storageBucket: "my-center-c834a.firebasestorage.app",
  messagingSenderId: "240238223779",
  appId: "1:240238223779:web:1307bde5acb92f8a62fa16",
  measurementId: "G-26SVJQK4E1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();
