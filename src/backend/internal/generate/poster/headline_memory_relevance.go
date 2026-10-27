package poster

import (
	"context"
	"regexp"
	"strings"
	"unicode"
)

var coverWords = regexp.MustCompile(`[a-z0-9]{2,}`)

func coverTerms(text string) map[string]bool {
	terms := map[string]bool{}
	text = strings.ToLower(text)
	for _, word := range coverWords.FindAllString(text, -1) {
		terms[word] = true
	}
	runes := []rune(text)
	for i := 1; i < len(runes); i++ {
		if unicode.Is(unicode.Han, runes[i-1]) && unicode.Is(unicode.Han, runes[i]) {
			terms[string(runes[i-1:i+1])] = true
		}
	}
	return terms
}

// Keyword overlap is an explainable tie-breaker, not a claim of semantic model evaluation.
func relevantCoverSample(ctx context.Context, db coverMemoryReader, workspace, query, newest string, groups map[string][]adoptedTrait) (string, error) {
	titles := map[string]string{}
	rows, err := db.QueryContext(ctx, `SELECT "id","title" FROM "CoverMemorySample" WHERE "workspaceId"=?`, workspace)
	if err != nil {
		return "", err
	}
	for rows.Next() {
		var id, title string
		if err := rows.Scan(&id, &title); err != nil {
			rows.Close()
			return "", err
		}
		titles[id] = title
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", err
	}
	feedback, err := coverSampleFeedback(ctx, db, workspace)
	if err != nil {
		return "", err
	}
	terms := coverTerms(query)
	chosen, best := newest, -1<<30
	for id, traits := range groups {
		reference := titles[id]
		for _, trait := range traits {
			reference += " " + trait.rule
		}
		words := coverTerms(reference)
		score := 0
		for term := range terms {
			if words[term] {
				score += 4
			}
		}
		// A few ratings help selection without allowing repeated votes to swamp product relevance.
		score += max(-6, min(6, feedback[id]*2))
		if score > best || score == best && (chosen == "" || traits[0].createdAt > groups[chosen][0].createdAt || traits[0].createdAt == groups[chosen][0].createdAt && id > chosen) {
			chosen, best = id, score
		}
	}
	return chosen, nil
}

func coverSampleFeedback(ctx context.Context, db coverMemoryReader, workspace string) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, `SELECT "rating","design" FROM "CoverMemoryUsage" WHERE "workspaceId"=? AND "rating"<>''`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	scores := map[string]int{}
	for rows.Next() {
		var rating, raw string
		if err := rows.Scan(&rating, &raw); err != nil {
			return nil, err
		}
		design := decodeCoverSheet(raw)
		sample := design["memorySampleId"]
		if rating == "good" {
			scores[sample]++
		} else if rating == "bad" {
			scores[sample]--
		}
	}
	return scores, rows.Err()
}
