import React from "react";
import { Image, Text, View, StyleSheet } from "react-native";

export default function Index(): React.ReactElement {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Kurvenconnect Logo"
      />
      <Text style={styles.title}>Kurvenconnect</Text>
      <Text style={styles.subtitle}>
        Wir bringen Fußballfans zusammen, damit aus gemeinsamer Leidenschaft
        echte Gemeinschaft wird.
      </Text>
      <Text style={styles.note}>
        Kurvenconnect verbindet zukünftig Fußballfans miteinander.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 24,
  },
  title: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    color: "#e6e6e6",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 680,
    marginBottom: 14,
  },
  note: {
    color: "#cccccc",
    fontSize: 13,
    textAlign: "center",
  },
});
