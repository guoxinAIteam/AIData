import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { authApi } from "../services/mockApi";
import type { AuthSession } from "../types/domain";

interface AuthState {
  session: AuthSession | null;
}

const initialState: AuthState = {
  session: authApi.getSessionSync(),
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<AuthSession>) {
      state.session = action.payload;
    },
    clearSession(state) {
      state.session = null;
    },
  },
});

export const { setSession, clearSession } = authSlice.actions;
export default authSlice.reducer;
