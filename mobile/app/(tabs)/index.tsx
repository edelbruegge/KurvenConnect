import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type FeedPost = {
  id: number;
  user: string;
  initials: string;
  time: string;
  category: string;
  description: string;
  likes: number;
  comments: number;
  accent: string;
  hasImage?: boolean;
};

const feedPosts: FeedPost[] = [
  {
    id: 1,
    user: 'Mina K.',
    initials: 'MK',
    time: 'vor 12 Min.',
    category: 'Beitrag',
    description:
      'Die Fansrunde vor dem Spiel wird heute wieder im Fanbereich starten. Wer kommt mit?',
    likes: 24,
    comments: 6,
    accent: '#F59E0B',
  },
  {
    id: 2,
    user: 'Luca R.',
    initials: 'LR',
    time: 'vor 27 Min.',
    category: 'Bild',
    description:
      'Ein kurzer Blick auf die neue Stadion-Atmosphäre vor dem Heimspiel – Platz für späteres Bildmaterial.',
    likes: 18,
    comments: 3,
    accent: '#38BDF8',
    hasImage: true,
  },
  {
    id: 3,
    user: 'Nora T.',
    initials: 'NT',
    time: 'vor 41 Min.',
    category: 'Ticket',
    description:
      '2 Tickets für die Nordtribüne sind noch verfügbar. Direkt bei mir abzugeben.',
    likes: 11,
    comments: 4,
    accent: '#34D399',
  },
  {
    id: 4,
    user: 'David S.',
    initials: 'DS',
    time: 'vor 1 Std.',
    category: 'Fahrt',
    description:
      'Ich fahre am Samstag mit 3 weiteren Fans zum Auswärtsspiel und nehme noch Mitfahrer auf.',
    likes: 15,
    comments: 2,
    accent: '#A78BFA',
  },
  {
    id: 5,
    user: 'Sina P.',
    initials: 'SP',
    time: 'vor 1 Std.',
    category: 'Gesuch',
    description:
      'Suche noch ein Ticket für den Familienblock – möglichst nah am Feld.',
    likes: 9,
    comments: 5,
    accent: '#FB7185',
  },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Kurvenconnect Feed</Text>
        <Text style={styles.subtitle}>Aktuelle Community-Updates aus dem Stadionalltag</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {feedPosts.map((post) => (
          <View key={post.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.userBlock}>
                <View style={styles.initialsBox}>
                  <Text style={styles.initialsText}>{post.initials}</Text>
                </View>
                <View>
                  <Text style={styles.userName}>{post.user}</Text>
                  <Text style={styles.time}>{post.time}</Text>
                </View>
              </View>
              <View style={[styles.badge, { backgroundColor: post.accent }]}>
                <Text style={styles.badgeText}>{post.category}</Text>
              </View>
            </View>

            {post.hasImage ? (
              <View style={styles.imageBox}>
                <Text style={styles.imageText}>Bildbereich</Text>
              </View>
            ) : null}

            <Text style={styles.description}>{post.description}</Text>

            <View style={styles.footer}>
              <Text style={styles.meta}>❤ {post.likes}</Text>
              <Text style={styles.meta}>💬 {post.comments}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomColor: '#1F2937',
    borderBottomWidth: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  initialsBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  time: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#050505',
    fontSize: 11,
    fontWeight: '700',
  },
  imageBox: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  imageText: {
    color: '#D1D5DB',
    fontSize: 13,
  },
  description: {
    color: '#F3F4F6',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    gap: 16,
  },
  meta: {
    color: '#9CA3AF',
    fontSize: 12,
  },
});
