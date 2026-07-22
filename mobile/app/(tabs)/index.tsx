import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image source={require('@/assets/images/icon.png')} style={styles.icon} />
        <Text style={styles.title}>Kurvenconnect</Text>
        <Text style={styles.mission}>
          Wir bringen Fußballfans zusammen, damit aus gemeinsamer Leidenschaft echte
          Gemeinschaft wird.
        </Text>
        <Text style={styles.hint}>Kurvenconnect verbindet zukünftig Fußballfans miteinander.</Text>
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
  icon: {
    width: 96,
    height: 96,
    marginBottom: 20,
    resizeMode: 'contain',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  mission: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  hint: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
});
