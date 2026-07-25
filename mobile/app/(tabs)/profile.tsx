import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, Text } from 'react-native';

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.description}>
          Hier wird später das Nutzerprofil und die Einstellungen sichtbar sein.
        </Text>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Platzhalter für die Profilansicht</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    color: '#D1D5DB',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  placeholder: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: '#111827',
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
});
