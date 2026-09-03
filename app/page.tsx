import initialBook from '../public/data/books/livy/01.json';
import manifest from '../public/data/manifest.json';
import { RomanHistoryReader, type ReaderManifest } from './reader';

export default function Home() {
  return (
    <RomanHistoryReader
      initialBook={initialBook as never}
      manifest={manifest as ReaderManifest}
      basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''}
    />
  );
}
