import { Share, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';

import { radius, space, useAppTheme } from '@/lib/theme';

export type Credentials = { name: string; schoolCode: string; loginId: string; password: string; title: string };

/** Shows the sign-in details after creating an account or resetting a password, with Share. */
export function CredentialsDialog({ creds, onDismiss }: { creds: Credentials | null; onDismiss: () => void }) {
  const t = useAppTheme();
  if (!creds) return null;
  const message = `School Hub sign-in for ${creds.name}\nSchool code: ${creds.schoolCode}\nLogin ID: ${creds.loginId}\nTemporary password: ${creds.password}\nYou'll be asked to set your own password at first login.`;
  const Line = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>{label}</Text>
      <Text variant="titleMedium" selectable style={{ fontWeight: '800', color: t.colors.onSurface, fontFamily: 'monospace' }}>{value}</Text>
    </View>
  );
  return (
    <Portal>
      <Dialog visible onDismiss={onDismiss}>
        <Dialog.Icon icon="account-key-outline" />
        <Dialog.Title style={{ textAlign: 'center' }}>{creds.title}</Dialog.Title>
        <Dialog.Content>
          <View style={{ backgroundColor: t.colors.surfaceVariant, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md }}>
            <Line label="School code" value={creds.schoolCode} />
            <Line label="Login ID" value={creds.loginId} />
            <Line label="Temporary password" value={creds.password} />
          </View>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
            They'll be asked to set their own password at first login. Share these details privately.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button icon="share-variant" onPress={() => { Share.share({ message }).catch(() => {}); }}>Share</Button>
          <Button onPress={onDismiss}>Done</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
