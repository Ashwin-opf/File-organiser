/**
 * Aho-Corasick Algorithm Implementation
 * for fast multi-pattern searching
 */

class AhoCorasick {
    constructor(keywords) {
        this.trie = { next: {}, fail: null, output: [] };
        // If keywords provided, build immediately
        if (keywords && Array.isArray(keywords)) {
            this.build(keywords);
        }
    }

    build(keywords) {
        this.trie = { next: {}, fail: null, output: [] };

        // 1. Build Trie
        for (const keyword of keywords) {
            let node = this.trie;
            for (const char of keyword) {
                if (!node.next[char]) {
                    node.next[char] = { next: {}, fail: null, output: [] };
                }
                node = node.next[char];
            }
            node.output.push(keyword);
        }

        // 2. Build Failure Links (BFS)
        const queue = [];
        for (const char in this.trie.next) {
            const node = this.trie.next[char];
            node.fail = this.trie;
            queue.push(node);
        }

        while (queue.length > 0) {
            const current = queue.shift();

            for (const char in current.next) {
                const nextNode = current.next[char];
                let failNode = current.fail;

                while (failNode && !failNode.next[char]) {
                    failNode = failNode.fail;
                }

                nextNode.fail = failNode ? failNode.next[char] : this.trie;
                nextNode.output = nextNode.output.concat(nextNode.fail.output);
                queue.push(nextNode);
            }
        }
    }

    search(text) {
        let node = this.trie;
        const results = [];

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            while (node && !node.next[char]) {
                node = node.fail;
            }

            if (!node) {
                node = this.trie;
                continue;
            }

            node = node.next[char];

            for (const keyword of node.output) {
                results.push({
                    keyword,
                    index: i - keyword.length + 1
                });
            }
        }

        return results;
    }
}

module.exports = AhoCorasick;
