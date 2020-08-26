ginx - simple reverse proxy for virtual hosting

usage:
	ginx [-p <http_port>] [-a <listen_address>] [-f <forward_address>] [-s <certificate_path> <key_path> [-q <https_port>]] [@|#]<host>:<port>[,...]

options:
	-p	The port to listen for HTTP traffic on [default: 80].
	-q	The port to listen for HTTPS traffic on [default: 443].
	-a	The address to listen on [default: 0.0.0.0].
	-f	The address to forward requests to [default: 127.0.0.1].
	-s	The certificate and key to use for HTTPS.

contact:
	http://cxii.org/

installation with git & npm:
	git clone https://github.com/CobaltXII/ginx.git
	npm install -g .

common usage:
	fwd a.com to localhost:1111, fwd b.com to localhost:2222, access via http
	on port 80
		ginx a.com:1111,b.com:2222

	fwd a.com to localhost:1111, fwd b.com to localhost:2222, access via https
	on port 443
		ginx -s cert.pem key.pem @a.com:1111,@b.com:1111

	fwd a.com to localhost:1111, fwd b.com to localhost:2222, access via http
	on port 8080
		ginx -p 8080 a.com:1111,b.com:2222

	fwd a.com to localhost:1111, fwd b.com to localhost:2222, access via https
	on port 8081
		ginx -s cert.pem key.pem -q 8081 @a.com:1111,@b.com:1111

	fwd a.com to localhost:1111, fwd b.com to localhost:2222, access via https
	on port 443, get redirected to https via http on port 80
		ginx -s cert.pem key.pem #a.com:1111,#b.com:1111

	fwd a.com to localhost:1111, fwd b.com to localhost:2222, access via https
	on port 8081, get redirected to https via http on port 8080
		ginx -p 8080 -s cert.pem key.pem -q 8081 #a.com:1111,#b.com:1111

example 1:
	ginx home.org:10000,art.org:10001,music.org:10002

		Assume you own three domains, home.org, art.org, and music.org. All of
		these point to your computer, which has the address 12.34.56.78. You
		want each site to respond with different content while still running
		them all on the same machine.

		First, you host three webservers using any webserver of your choice.
		You make sure each one listens on localhost, so that you cannot connect
		to them via your local IP address or your global IP address. Each one
		runs on a separate port (in this case, the home server uses port 10000,
		the art server uses port 10001, and the music server uses port 10002).
		Make sure you can access the right sites by visiting localhost:10000,
		localhost:10001, and so on using the browser on your computer.

		To make these servers available to the public, run the command above.
		ginx will forward all traffic for home.org to it's designated local
		server (127.0.0.1:10000), and so on for the other domains. Now anyone
		can visit home.org, art.org, or music.org and see different content
		while in reality all three sites are running on the exact same machine.

		If someone tries to connect to your server directly, (i.e. by typing
		http://12.34.56.78/) then ginx will use the first rule. So it will be
		as if they were connecting to home.org instead.

example 2:
	ginx -s cert.pem key.pem @home.org:10000,art.org:10001,@music.org:10002

		This command does the same thing as example 1, except that it enables
		HTTPS on home.org and music.org using the specified certificate and
		key combination. Note that only the rules preceded by a '@' symbol will
		have HTTPS support. Also bear in mind that the certificate must
		represent each of the domains that is to have HTTPS support. You cannot
		use two certificates (i.e. one for home.org and one for music.org). If
		you want to do this, you will unfortunately have to own two distinct IP
		addresses.

example 3:
	ginx -s cert.pem key.pem #home.org:10000,#art.org:10001,@music.org:10002

		This command does the same thing as example 2, except that it runs an
		HTTPS server for all three domains, and it also enables a parallel HTTP
		redirect server for home.org and art.org. These HTTP redirect servers
		run on port 80 and use 301 Moved Permanently responses for redirection.