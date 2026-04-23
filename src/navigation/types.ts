import { EmergencyContact, DeathNote, ActivityLog } from '../models/types';

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  Activity: undefined;
  EmergencyContacts: undefined;
  DeathNote: undefined;
  Settings: undefined;
};

export type ContactStackParamList = {
  ContactList: undefined;
  AddContact: undefined;
  EditContact: { contact: EmergencyContact };
};

export type DeathNoteStackParamList = {
  DeathNoteMain: undefined;
  AddressEdit: undefined;
  FinancialAccounts: undefined;
  Pets: undefined;
  OtherInfo: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}