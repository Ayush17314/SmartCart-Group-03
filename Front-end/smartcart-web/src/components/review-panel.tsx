"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Flag } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ReviewPanel({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");

  const reviews = useQuery({
    queryKey: ["product-reviews", productId],
    queryFn: () => api.reviews(productId),
  });

  const submit = useMutation({
    mutationFn: () => api.createReview(productId, { rating, title, body }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      toast.success("Thank you! Your review has been submitted.");
      void qc.invalidateQueries({ queryKey: ["product-reviews", productId] });
    },
    onError: (error) => toast.error(error.message || "Could not submit review"),
  });

  const report = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.reportReview(id, reason),
    onSuccess: () => {
      setReportingId(null);
      setReportReason("");
      toast.success("Thank you. Our team will review this feedback.");
    },
    onError: (error) => toast.error(error.message || "Could not submit report"),
  });

  return (
    <div className="space-y-8">
      {/* Write a review form */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit.mutate();
        }}
        className="rounded-2xl border border-ink/10 bg-sand/30 p-5"
      >
        <h3 className="font-display text-lg font-semibold text-ink">Write a Customer Review</h3>
        <p className="mb-4 mt-1 text-xs text-ink/60">
          Verified buyers who have received this item can rate and review their purchase.
        </p>

        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <span className="block text-xs font-semibold text-ink/80">Your Rating</span>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-0.5 text-amber-500 transition hover:scale-110"
                  aria-label={`Rate ${star} out of 5 stars`}
                >
                  <Star
                    size={20}
                    className={star <= rating ? "fill-amber-400 text-amber-400" : "text-ink/20"}
                  />
                </button>
              ))}
            </div>
          </div>

          <label className="text-xs font-semibold text-ink/80">
            Review Headline
            <input
              className="field mt-1"
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What's most important to know?"
            />
          </label>
        </div>

        <label className="mt-3 block text-xs font-semibold text-ink/80">
          Written Review
          <textarea
            className="field mt-1 min-h-24"
            required
            minLength={10}
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What did you like or dislike? How was the quality and fit?"
          />
        </label>

        <Button className="mt-4" size="sm" type="submit" disabled={submit.isPending}>
          {submit.isPending ? "Submitting..." : "Submit Review"}
        </Button>
      </form>

      {/* Existing Reviews */}
      <div>
        <h3 className="mb-4 font-display text-lg font-semibold text-ink">Verified Customer Reviews</h3>
        {reviews.isLoading ? (
          <div className="skeleton h-32 rounded-2xl" />
        ) : reviews.isError ? (
          <p role="alert" className="text-xs text-red-700">
            Unable to load reviews at the moment.
          </p>
        ) : !reviews.data?.items.length ? (
          <p className="rounded-xl border border-ink/5 bg-sand/20 p-6 text-center text-xs text-ink/60">
            No customer reviews yet. Be the first to review this product after delivery!
          </p>
        ) : (
          <div className="divide-y divide-ink/10">
            {reviews.data.items.map((review) => (
              <article key={review._id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex text-amber-500" aria-label={`${review.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={14}
                            className={s <= review.rating ? "fill-amber-400 text-amber-400" : "text-ink/20"}
                          />
                        ))}
                      </div>
                      <h4 className="font-semibold text-ink text-sm">{review.title}</h4>
                    </div>
                    <p className="mt-1 text-[11px] text-ink/50">
                      Reviewed by <strong className="text-ink/70">{review.userName}</strong> on{" "}
                      {new Date(review.createdAt).toLocaleDateString()} •{" "}
                      <span className="text-emerald-700 font-medium">Verified Purchase</span>
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink/80">
                      {review.body}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="shrink-0 flex items-center gap-1 text-[11px] text-ink/40 hover:text-ink/70"
                    onClick={() => setReportingId(reportingId === review._id ? null : review._id)}
                  >
                    <Flag size={12} /> Report
                  </button>
                </div>

                {reportingId === review._id && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-sand/40 p-2.5">
                    <input
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      placeholder="Reason for reporting this review..."
                      className="flex-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs outline-none"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs px-3"
                      disabled={reportReason.trim().length < 3 || report.isPending}
                      onClick={() => report.mutate({ id: review._id, reason: reportReason.trim() })}
                    >
                      Send
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
