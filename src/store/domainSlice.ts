import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { seededDomainData } from "../mocks/db";
import type { ExampleQuestion, GlossaryTerm, KnowledgeSystemCard } from "../types/domain";

interface DomainState {
  knowledgeSystems: KnowledgeSystemCard[];
  glossaryTerms: GlossaryTerm[];
  exampleQuestions: ExampleQuestion[];
}

const initialState: DomainState = {
  knowledgeSystems: seededDomainData.knowledgeSystems,
  glossaryTerms: seededDomainData.glossaryTerms,
  exampleQuestions: seededDomainData.exampleQuestions,
};

const domainSlice = createSlice({
  name: "domain",
  initialState,
  reducers: {
    setKnowledgeSystems(state, action: PayloadAction<KnowledgeSystemCard[]>) {
      state.knowledgeSystems = action.payload;
    },
    setGlossaryTerms(state, action: PayloadAction<GlossaryTerm[]>) {
      state.glossaryTerms = action.payload;
    },
    setExampleQuestions(state, action: PayloadAction<ExampleQuestion[]>) {
      state.exampleQuestions = action.payload;
    },
  },
});

export const { setKnowledgeSystems, setGlossaryTerms, setExampleQuestions } = domainSlice.actions;
export default domainSlice.reducer;
