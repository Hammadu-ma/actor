import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBXFcbQlTB1mXBsHd_bxnHdgS7dmHK_x3k",
  authDomain: "exam-d9415.firebaseapp.com",
  projectId: "exam-d9415",
  storageBucket: "exam-d9415.firebasestorage.app",
  messagingSenderId: "258742955197",
  appId: "1:258742955197:web:a8e6a179f9e7c23c5b5bd4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
