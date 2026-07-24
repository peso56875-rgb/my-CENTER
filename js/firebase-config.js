// Firebase Configuration for PESO Booking System
const firebaseConfig = {
  apiKey: "AIzaSyB7lZEmF_gBcwWyMHQB_Ia_WXiEgi9AL8c",
  authDomain: "my-student-e9a87.firebaseapp.com",
  projectId: "my-student-e9a87",
  storageBucket: "my-student-e9a87.firebasestorage.app",
  messagingSenderId: "224479679685",
  appId: "1:224479679685:web:9afdaa9bfdf334abd60cac",
  measurementId: "G-TQ2W3JMHGE"
};

// Initialize Firebase safely
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize Firestore
const db = firebase.firestore();


