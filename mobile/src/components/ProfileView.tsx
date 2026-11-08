import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { api, getBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

import { Button, Card, Field, Header, Screen, styles } from './ui';

export function ProfileView({ extra }: { extra?: string }) {
  const { user, logout } = useAuth();
  const [oldPw, setOld] = useState('');
  const [newPw, setNew] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function change() {
    if (newPw.length < 6) return Alert.alert('New password must be at least 6 characters');
    setBusy(true);
    try {
      await api('/auth/password', { body: { old_password: oldPw, new_password: newPw } });
      setOld('');
      setNew('');
      Alert.alert('Password changed');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header title="Profile" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{user.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h2}>{user.name}</Text>
            <Text style={styles.muted}>{user.email}</Text>
            <Text style={[styles.muted, { textTransform: 'capitalize' }]}>{user.role}{extra ? ` · ${extra}` : ''}</Text>
          </View>
        </View>
      </Card>
      <Card title="Change password">
        <Field label="Current password" value={oldPw} onChangeText={setOld} secureTextEntry />
        <Field label="New password" value={newPw} onChangeText={setNew} secureTextEntry />
        <Button title="Update password" variant="secondary" onPress={change} loading={busy} />
      </Card>
      <Button title="Log out" variant="danger" onPress={logout} />
      <Text style={[styles.muted, { fontSize: 12, textAlign: 'center', marginTop: space.lg }]}>Server: {getBaseUrl()}</Text>
    </Screen>
  );
}
