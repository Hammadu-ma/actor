import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCWquYbzfwt1oEqvXEuQOMUyhIoSS-V4FE",
  authDomain: "schoolhub-ada40.firebaseapp.com",
  projectId: "schoolhub-ada40",
  storageBucket: "schoolhub-ada40.firebasestorage.app",
  messagingSenderId: "1004768478486",
  appId: "1:1004768478486:web:910f3d3ed06885d68dfc37"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);