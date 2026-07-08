import hashlib
import math


class MockEmbeddingProvider:
    def __init__(self, dimension: int = 1536) -> None:
        self.dimension = dimension

    def embed(self, content: str) -> list[float]:
        values: list[float] = []
        seed = hashlib.sha256(content.encode("utf-8")).digest()
        counter = 0

        while len(values) < self.dimension:
            digest = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
            for index in range(0, len(digest), 4):
                if len(values) >= self.dimension:
                    break
                integer = int.from_bytes(digest[index : index + 4], "big", signed=False)
                values.append((integer / 0xFFFFFFFF) * 2.0 - 1.0)
            counter += 1

        norm = math.sqrt(sum(value * value for value in values)) or 1.0
        return [round(value / norm, 8) for value in values]
