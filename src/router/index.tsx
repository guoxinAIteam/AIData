import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { getDefaultAuthorizedRoute, hasPermission } from "../config/permissionMap";
import { AppLayout } from "../layouts/AppLayout";
import { AuthLayout } from "../layouts/AuthLayout";
import { useAppSelector } from "../store/hooks";
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { ExampleQuestionListPage } from "../pages/domain/example/ExampleQuestionListPage";
import { GlossaryFormPage } from "../pages/domain/glossary/GlossaryFormPage";
import { GlossaryListPage } from "../pages/domain/glossary/GlossaryListPage";
import { KnowledgeSystemListPage } from "../pages/domain/knowledge/KnowledgeSystemListPage";
import { KnowledgeSystemManagePage } from "../pages/domain/knowledge/KnowledgeSystemManagePage";
import { MetricQAPage } from "../pages/domain/metrics/MetricQAPage";
import { OntologyModelingPage } from "../pages/domain/ontology/OntologyModelingPage";
import { SkillRankingPage } from "../pages/domain/skills/SkillRankingPage";
import { TraceCenterPage } from "../pages/domain/trace/TraceCenterPage";
import { WorkbenchPage } from "../pages/domain/workbench/WorkbenchPage";
import { QuestionLabelingListPage } from "../pages/domain/questionLabeling/QuestionLabelingListPage";
import { QuestionLabelingDetailPage } from "../pages/domain/questionLabeling/QuestionLabelingDetailPage";
import type { MenuPermissionCode } from "../config/permissionMap";

function RequireAuth() {
  const session = useAppSelector((state) => state.auth.session);
  const location = useLocation();
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function RedirectByAuth() {
  const session = useAppSelector((state) => state.auth.session);
  return <Navigate to={session ? getDefaultAuthorizedRoute(session) : "/login"} replace />;
}

function RequirePermission({
  permissionCode,
  children,
}: {
  permissionCode: MenuPermissionCode;
  children: JSX.Element;
}) {
  const session = useAppSelector((state) => state.auth.session);
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (!hasPermission(session, permissionCode)) {
    return <Navigate to={getDefaultAuthorizedRoute(session)} replace />;
  }
  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/domain" element={<AppLayout />}>
          <Route index element={<Navigate to="/domain/workbench" replace />} />
          <Route
            path="workbench"
            element={
              <RequirePermission permissionCode="menu.workbench">
                <WorkbenchPage />
              </RequirePermission>
            }
          />
          <Route
            path="knowledge-systems"
            element={
              <RequirePermission permissionCode="menu.knowledgeSystem">
                <KnowledgeSystemListPage />
              </RequirePermission>
            }
          />
          <Route
            path="knowledge-systems/:id/manage/:tab"
            element={
              <RequirePermission permissionCode="menu.knowledgeSystem">
                <KnowledgeSystemManagePage />
              </RequirePermission>
            }
          />
          <Route
            path="example-questions"
            element={
              <RequirePermission permissionCode="menu.exampleQuestion">
                <ExampleQuestionListPage />
              </RequirePermission>
            }
          />
          <Route
            path="glossary"
            element={
              <RequirePermission permissionCode="menu.glossary">
                <GlossaryListPage />
              </RequirePermission>
            }
          />
          <Route
            path="glossary/new"
            element={
              <RequirePermission permissionCode="menu.glossary">
                <GlossaryFormPage />
              </RequirePermission>
            }
          />
          <Route
            path="glossary/:id/edit"
            element={
              <RequirePermission permissionCode="menu.glossary">
                <GlossaryFormPage />
              </RequirePermission>
            }
          />
          <Route path="trace-center" element={<Navigate to="/domain/operation-logs" replace />} />
          <Route
            path="operation-logs"
            element={
              <RequirePermission permissionCode="menu.operationLog">
                <TraceCenterPage />
              </RequirePermission>
            }
          />
          <Route
            path="skills"
            element={
              <RequirePermission permissionCode="menu.skillRanking">
                <SkillRankingPage />
              </RequirePermission>
            }
          />
          <Route
            path="metric-qa"
            element={
              <RequirePermission permissionCode="menu.metricQa">
                <MetricQAPage />
              </RequirePermission>
            }
          />
          <Route
            path="ontology-modeling"
            element={
              <RequirePermission permissionCode="menu.ontologyModeling">
                <OntologyModelingPage />
              </RequirePermission>
            }
          />
          <Route
            path="question-labeling"
            element={
              <RequirePermission permissionCode="menu.questionLabeling">
                <QuestionLabelingListPage />
              </RequirePermission>
            }
          />
          <Route
            path="question-labeling/:jobId"
            element={
              <RequirePermission permissionCode="menu.questionLabeling">
                <QuestionLabelingDetailPage />
              </RequirePermission>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<RedirectByAuth />} />
    </Routes>
  );
}
