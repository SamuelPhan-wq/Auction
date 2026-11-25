// ============================================================
//  AUCTION ITEMS — one line per artwork.
//  id     : never change after bidding starts (QR codes use it)
//  lot    : number shown on labels
//  title  : name of the artwork
//  image  : file name inside images/full and images/thumb
//  Optional per item: artist, description, startingBid, minIncrement, value
//  e.g. { id: "lion", lot: 15, title: "Lion", image: "lion.jpg", startingBid: 50 },
// ============================================================
window.AUCTION_DEFAULT_MEDIUM = "Painting on pandan leaves";

window.AUCTION_ITEMS = [
  { id: "beetle", lot: 1, title: "Beetle", image: "beetle.jpg" },
  { id: "butterfly-mosaic", lot: 2, title: "Butterfly (Mosaic)", image: "butterfly-mosaic.jpg" },
  { id: "cat", lot: 3, title: "Cat", image: "cat.jpg" },
  { id: "crazy-bird", lot: 4, title: "Crazy Bird", image: "crazy-bird.jpg" },
  { id: "duc-langer-mosaic", lot: 5, title: "Douc Langur (Mosaic)", image: "duc-langer-mosaic.jpg" },
  { id: "elephant-mosaic", lot: 6, title: "Elephant (Mosaic)", image: "elephant-mosaic.jpg" },
  { id: "fat-bird", lot: 7, title: "Fat Bird", image: "fat-bird.jpg" },
  { id: "flowers-with-bird", lot: 8, title: "Flowers With Bird", image: "flowers-with-bird.jpg" },
  { id: "frog", lot: 9, title: "Frog", image: "frog.jpg" },
  { id: "hornbil-1-mosaic", lot: 10, title: "Hornbill I (Mosaic)", image: "hornbil-1-mosaic.jpg" },
  { id: "hornbil-2-mosaic", lot: 11, title: "Hornbill II (Mosaic)", image: "hornbil-2-mosaic.jpg" },
  { id: "hornbil-3", lot: 12, title: "Hornbill III", image: "hornbil-3.jpg" },
  { id: "hornbil-4", lot: 13, title: "Hornbill IV", image: "hornbil-4.jpg" },
  { id: "hummingbird-mosaic", lot: 14, title: "Hummingbird (Mosaic)", image: "hummingbird-mosaic.jpg" },
  { id: "leopard", lot: 15, title: "Leopard", image: "leopard.jpg" },
  { id: "leopard-cat-mosaic", lot: 16, title: "Leopard Cat (Mosaic)", image: "leopard-cat-mosaic.jpg" },
  { id: "leopard-mosaic", lot: 17, title: "Leopard (Mosaic)", image: "leopard-mosaic.jpg" },
  { id: "lion", lot: 18, title: "Lion", image: "lion.jpg" },
  { id: "plant", lot: 19, title: "Plant", image: "plant.jpg" },
  { id: "plants", lot: 20, title: "Plants II", image: "plants.jpg" },
  { id: "rainbow-bird", lot: 21, title: "Rainbow Bird", image: "rainbow-bird.jpg" },
  { id: "red-bird", lot: 22, title: "Red Bird", image: "red-bird.jpg" },
  { id: "snail", lot: 23, title: "Snail", image: "snail.jpg" },
  { id: "snail-2", lot: 24, title: "Snail II", image: "snail-2.jpg" },
  { id: "tiger", lot: 25, title: "Tiger", image: "tiger.jpg" },
  { id: "tiger-mosaic", lot: 26, title: "Tiger (Mosaic)", image: "tiger-mosaic.jpg" },
  { id: "two-birds", lot: 27, title: "Two Birds", image: "two-birds.jpg" },
  { id: "two-elephants", lot: 28, title: "Two Elephants", image: "two-elephants.jpg" },
  { id: "woman", lot: 29, title: "Woman", image: "woman.jpg" },
];
