import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import domainReducer from "./domainSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    domain: domainReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
