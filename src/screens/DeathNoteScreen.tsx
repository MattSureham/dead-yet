import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useDeathNote } from '../contexts/DeathNoteContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DeathNote'>;
};

export default function DeathNoteScreen({ navigation }: Props) {
  const { deathNote, updateAddress, addFinancialAccount, removeFinancialAccount, addPet, removePet, updateOtherInfo } = useDeathNote();
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showFinancialForm, setShowFinancialForm] = useState(false);
  const [showPetForm, setShowPetForm] = useState(false);

  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    entryCode: '',
  });

  const [financial, setFinancial] = useState({
    institution: '',
    accountType: 'bank' as const,
    accountName: '',
    notes: '',
  });

  const [pet, setPet] = useState({
    name: '',
    species: '',
    feedingInstructions: '',
    veterinaryContact: '',
    otherCareNotes: '',
  });

  const handleSaveAddress = async () => {
    if (!address.street.trim()) {
      Alert.alert('Error', 'Street address is required');
      return;
    }
    await updateAddress(address);
    setShowAddressForm(false);
  };

  const handleAddFinancial = async () => {
    if (!financial.institution.trim() || !financial.accountName.trim()) {
      Alert.alert('Error', 'Institution and account name are required');
      return;
    }
    await addFinancialAccount(financial);
    setFinancial({ institution: '', accountType: 'bank', accountName: '', notes: '' });
    setShowFinancialForm(false);
  };

  const handleAddPet = async () => {
    if (!pet.name.trim() || !pet.species.trim()) {
      Alert.alert('Error', 'Name and species are required');
      return;
    }
    await addPet(pet);
    setPet({ name: '', species: '', feedingInstructions: '', veterinaryContact: '', otherCareNotes: '' });
    setShowPetForm(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Death Notes</Text>
        <Text style={styles.subtitle}>
          Important information for those left behind
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📍 Address</Text>
          {!showAddressForm && (
            <TouchableOpacity onPress={() => setShowAddressForm(true)}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
        {deathNote?.address || showAddressForm ? (
          showAddressForm ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Street Address *"
                placeholderTextColor={COLORS.textMuted}
                value={address.street}
                onChangeText={(t) => setAddress({ ...address, street: t })}
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex2]}
                  placeholder="City"
                  placeholderTextColor={COLORS.textMuted}
                  value={address.city}
                  onChangeText={(t) => setAddress({ ...address, city: t })}
                />
                <TextInput
                  style={[styles.input, styles.flex1]}
                  placeholder="State"
                  placeholderTextColor={COLORS.textMuted}
                  value={address.state}
                  onChangeText={(t) => setAddress({ ...address, state: t })}
                />
              </View>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex1]}
                  placeholder="ZIP Code"
                  placeholderTextColor={COLORS.textMuted}
                  value={address.zipCode}
                  onChangeText={(t) => setAddress({ ...address, zipCode: t })}
                />
                <TextInput
                  style={[styles.input, styles.flex2]}
                  placeholder="Country"
                  placeholderTextColor={COLORS.textMuted}
                  value={address.country}
                  onChangeText={(t) => setAddress({ ...address, country: t })}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Entry Code (gate, apartment)"
                placeholderTextColor={COLORS.textMuted}
                value={address.entryCode}
                onChangeText={(t) => setAddress({ ...address, entryCode: t })}
              />
              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddressForm(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAddress}>
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>{deathNote?.address?.street}</Text>
              <Text style={styles.infoText}>
                {deathNote?.address?.city}, {deathNote?.address?.state} {deathNote?.address?.zipCode}
              </Text>
              {deathNote?.address?.entryCode && (
                <Text style={styles.infoMuted}>Entry: {deathNote?.address?.entryCode}</Text>
              )}
            </View>
          )
        ) : (
          <TouchableOpacity style={styles.addSection} onPress={() => setShowAddressForm(true)}>
            <Text style={styles.addSectionText}>+ Add your address</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>💰 Financial Accounts</Text>
          {!showFinancialForm && (
            <TouchableOpacity onPress={() => setShowFinancialForm(true)}>
              <Text style={styles.editText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {(deathNote?.financialAccounts?.length ?? 0) > 0 && (
          <View style={styles.list}>
            {deathNote?.financialAccounts.map((account) => (
              <View key={account.id} style={styles.listItem}>
                <View>
                  <Text style={styles.itemTitle}>{account.accountName}</Text>
                  <Text style={styles.itemSubtitle}>{account.institution} • {account.accountType}</Text>
                </View>
                <TouchableOpacity onPress={() => removeFinancialAccount(account.id)}>
                  <Text style={styles.removeText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {showFinancialForm && (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Institution (e.g., Chase Bank)"
              placeholderTextColor={COLORS.textMuted}
              value={financial.institution}
              onChangeText={(t) => setFinancial({ ...financial, institution: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Account Name (e.g., Checking Account)"
              placeholderTextColor={COLORS.textMuted}
              value={financial.accountName}
              onChangeText={(t) => setFinancial({ ...financial, accountName: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Notes (account numbers, etc.)"
              placeholderTextColor={COLORS.textMuted}
              value={financial.notes}
              onChangeText={(t) => setFinancial({ ...financial, notes: t })}
            />
            <View style={styles.formButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowFinancialForm(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddFinancial}>
                <Text style={styles.saveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!showFinancialForm && (deathNote?.financialAccounts?.length ?? 0) === 0 && (
          <TouchableOpacity style={styles.addSection} onPress={() => setShowFinancialForm(true)}>
            <Text style={styles.addSectionText}>+ Add financial accounts</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🐕 Pets</Text>
          {!showPetForm && (
            <TouchableOpacity onPress={() => setShowPetForm(true)}>
              <Text style={styles.editText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {(deathNote?.pets?.length ?? 0) > 0 && (
          <View style={styles.list}>
            {deathNote?.pets.map((p) => (
              <View key={p.id} style={styles.listItem}>
                <View>
                  <Text style={styles.itemTitle}>{p.name}</Text>
                  <Text style={styles.itemSubtitle}>{p.species}</Text>
                </View>
                <TouchableOpacity onPress={() => removePet(p.id)}>
                  <Text style={styles.removeText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {showPetForm && (
          <View style={styles.form}>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex1]}
                placeholder="Pet Name *"
                placeholderTextColor={COLORS.textMuted}
                value={pet.name}
                onChangeText={(t) => setPet({ ...pet, name: t })}
              />
              <TextInput
                style={[styles.input, styles.flex1]}
                placeholder="Species *"
                placeholderTextColor={COLORS.textMuted}
                value={pet.species}
                onChangeText={(t) => setPet({ ...pet, species: t })}
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Feeding Instructions"
              placeholderTextColor={COLORS.textMuted}
              value={pet.feedingInstructions}
              onChangeText={(t) => setPet({ ...pet, feedingInstructions: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Veterinary Contact"
              placeholderTextColor={COLORS.textMuted}
              value={pet.veterinaryContact}
              onChangeText={(t) => setPet({ ...pet, veterinaryContact: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Other Care Notes"
              placeholderTextColor={COLORS.textMuted}
              value={pet.otherCareNotes}
              onChangeText={(t) => setPet({ ...pet, otherCareNotes: t })}
            />
            <View style={styles.formButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPetForm(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddPet}>
                <Text style={styles.saveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!showPetForm && (deathNote?.pets?.length ?? 0) === 0 && (
          <TouchableOpacity style={styles.addSection} onPress={() => setShowPetForm(true)}>
            <Text style={styles.addSectionText}>+ Add pets</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📋 Other Important Info</Text>
        </View>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Anything else people need to know..."
          placeholderTextColor={COLORS.textMuted}
          value={deathNote?.otherImportantInfo || ''}
          onChangeText={updateOtherInfo}
          multiline
          numberOfLines={4}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg },
  header: { marginBottom: SPACING.xl },
  title: { fontSize: FONT_SIZES.xxl, fontWeight: 'bold', color: COLORS.text },
  subtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: SPACING.xs },
  section: { marginBottom: SPACING.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text },
  editText: { color: COLORS.primary, fontSize: FONT_SIZES.md },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  infoText: { color: COLORS.text, fontSize: FONT_SIZES.md },
  infoMuted: { color: COLORS.textMuted, fontSize: FONT_SIZES.sm, marginTop: SPACING.xs },
  list: { gap: SPACING.sm },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  itemTitle: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: '600' },
  itemSubtitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: 2 },
  removeText: { fontSize: 24, color: COLORS.danger },
  addSection: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  addSectionText: { color: COLORS.primary, fontSize: FONT_SIZES.md },
  form: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  input: { backgroundColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: SPACING.md },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  formButtons: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  cancelBtn: { flex: 1, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, alignItems: 'center', backgroundColor: COLORS.surfaceLight },
  cancelText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md },
  saveBtn: { flex: 1, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, alignItems: 'center', backgroundColor: COLORS.primary },
  saveText: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: '600' },
});