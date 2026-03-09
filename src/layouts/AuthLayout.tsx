import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="zy-auth-bg">
      <Outlet />
    </div>
  );
}
